import { describe, expect, it } from "vitest";
import { createDocument } from "../src/document/document.js";
import { History } from "../src/runtime/history.js";

// Fase 5, Blocco C: History possiede la selezione (singola, Decisione 5),
// separata dagli snapshot di undo/redo.

function baseDocument() {
  return createDocument({ rootPageId: "page-home", rootNodeId: "root" });
}

describe("History — selezione", () => {
  it("parte senza selezione (null)", () => {
    const history = new History(baseDocument());
    expect(history.selection).toBeNull();
  });

  it("select() imposta la selezione; deselect() la azzera", () => {
    const history = new History(baseDocument());
    history.select("root");
    expect(history.selection).toBe("root");

    history.deselect();
    expect(history.selection).toBeNull();
  });

  it("select() sostituisce la selezione precedente (singola, non un insieme)", () => {
    const history = new History(baseDocument());
    history.select("root");
    history.select("altro-nodo");
    expect(history.selection).toBe("altro-nodo");
  });

  it("select()/deselect() non creano voci di undo/redo", () => {
    const history = new History(baseDocument());
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);

    history.select("root");
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);

    history.deselect();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it("select()/deselect() non modificano il Document (stessa identità di riferimento)", () => {
    const history = new History(baseDocument());
    const documentBefore = history.document;

    history.select("root");
    expect(history.document).toBe(documentBefore);

    history.deselect();
    expect(history.document).toBe(documentBefore);
  });

  it("undo/redo non toccano la selezione: resta esattamente come impostata, anche se il nodo selezionato scompare", () => {
    const history = new History(baseDocument());
    history.execute({ type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    history.select("a");
    expect(history.selection).toBe("a");

    // undo rimuove "a" dal Document, ma la selezione (stato separato, per
    // design - vedi history.ts) non viene ri-validata né azzerata in automatico.
    history.undo();
    expect(history.document.nodes.has("a")).toBe(false);
    expect(history.selection).toBe("a"); // ancora "a", anche se pendente

    history.redo();
    expect(history.document.nodes.has("a")).toBe(true);
    expect(history.selection).toBe("a");
  });

  it("execute() non azzera né altera la selezione", () => {
    const history = new History(baseDocument());
    history.select("root");
    history.execute({ type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    expect(history.selection).toBe("root");
  });

  it("select() accetta un nodeId che non esiste nel Document corrente (nessuna validazione - stato disaccoppiato per design)", () => {
    const history = new History(baseDocument());
    expect(() => history.select("nodo-inesistente")).not.toThrow();
    expect(history.selection).toBe("nodo-inesistente");
  });
});
