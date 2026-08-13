import { describe, expect, it } from "vitest";
import { createDocument, getNode } from "../src/document/document.js";
import { hashDocument } from "../src/document/hash.js";
import { validateDocument } from "../src/document/invariants.js";
import { History } from "../src/runtime/history.js";
import type { Command } from "../src/runtime/commands.js";
import { CURRENT_SCHEMA_VERSION, type Document, type DocumentNode } from "../src/document/types.js";

function baseDocument() {
  return createDocument({ rootPageId: "page-home", rootNodeId: "root" });
}

/** Come in performance.test.ts: costruisce N nodi senza passare dal CommandBus, per non pagare il costo O(n^2) noto in un test che non misura tempo. */
function buildFlatDocumentDirectly(n: number): Document {
  const nodes = new Map<string, DocumentNode>();
  const childrenIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = `n${i}`;
    childrenIds.push(id);
    nodes.set(id, { id, type: "box", parentId: "root", childrenIds: [], props: {} });
  }
  nodes.set("root", { id: "root", type: "page-root", parentId: null, childrenIds, props: {} });
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    rootPageId: "page-home",
    nodes,
    pages: new Map([["page-home", { id: "page-home", name: "Home", rootNodeId: "root" }]]),
    pageOrder: ["page-home"],
  };
}

describe("History", () => {
  it("starts with canUndo/canRedo both false", () => {
    const history = new History(baseDocument());
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
  });

  it("undo reverts the last command; redo re-applies it", () => {
    const history = new History(baseDocument());
    history.execute({ type: "CREATE_NODE", nodeId: "a", nodeType: "text", parentId: "root" });

    expect(getNode(history.document, "a")).toBeDefined();

    history.undo();
    expect(getNode(history.document, "a")).toBeUndefined();
    expect(history.canRedo).toBe(true);

    history.redo();
    expect(getNode(history.document, "a")).toBeDefined();
  });

  it("executing a new command after undo clears the redo stack", () => {
    const history = new History(baseDocument());
    history.execute({ type: "CREATE_NODE", nodeId: "a", nodeType: "text", parentId: "root" });
    history.undo();
    history.execute({ type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "root" });

    expect(history.canRedo).toBe(false);
    expect(getNode(history.document, "a")).toBeUndefined();
    expect(getNode(history.document, "b")).toBeDefined();
  });

  it("undo/redo beyond the available history is a no-op", () => {
    const history = new History(baseDocument());
    const initialHash = hashDocument(history.document);

    history.undo(); // nothing to undo
    expect(hashDocument(history.document)).toBe(initialHash);

    history.redo(); // nothing to redo
    expect(hashDocument(history.document)).toBe(initialHash);
  });

  it("undo followed by redo always restores the exact same Document hash (RFC-000 §12)", () => {
    const history = new History(baseDocument());
    const commands: Command[] = [
      { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" },
      { type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "a", props: { content: "hi", size: 12 } },
      { type: "UPDATE_PROPS", nodeId: "b", props: { content: "hello" } },
      { type: "CREATE_NODE", nodeId: "c", nodeType: "text", parentId: "a" },
      { type: "DELETE_NODE", nodeId: "c" },
      { type: "UPDATE_PROPS", nodeId: "a", props: { visible: true } },
    ];

    const hashesAfterEachCommand: string[] = [];
    for (const command of commands) {
      history.execute(command);
      hashesAfterEachCommand.push(hashDocument(history.document));
    }

    // Undo everything, one step at a time, then redo everything, one step
    // at a time: at every point the hash must match what it was the first
    // time around, and the Document must remain invariant-valid.
    for (let i = commands.length - 1; i >= 0; i--) {
      history.undo();
      expect(validateDocument(history.document)).toEqual([]);
    }

    for (let i = 0; i < commands.length; i++) {
      history.redo();
      expect(hashDocument(history.document)).toBe(hashesAfterEachCommand[i]);
      expect(validateDocument(history.document)).toEqual([]);
    }

    // Full round trip: undo everything, redo everything, must land back on
    // the exact same hash as right after the original command sequence.
    for (let i = 0; i < commands.length; i++) history.undo();
    for (let i = 0; i < commands.length; i++) history.redo();

    expect(hashDocument(history.document)).toBe(hashesAfterEachCommand[hashesAfterEachCommand.length - 1]);
  });

  it("partial undo/redo round trips also preserve the hash invariant", () => {
    const history = new History(baseDocument());
    history.execute({ type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    history.execute({ type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "a" });
    history.execute({ type: "UPDATE_PROPS", nodeId: "b", props: { content: "x" } });

    const hashBeforeUndo = hashDocument(history.document);

    history.undo();
    history.undo();
    history.redo();
    history.redo();

    expect(hashDocument(history.document)).toBe(hashBeforeUndo);
  });

  it("undo after DELETE_NODE restores the exact pre-delete structure, including children order", () => {
    const history = new History(baseDocument());
    // root ha 3 figli ordinati: x, y, z. Cancelliamo quello in mezzo.
    history.execute({ type: "CREATE_NODE", nodeId: "x", nodeType: "box", parentId: "root" });
    history.execute({ type: "CREATE_NODE", nodeId: "y", nodeType: "box", parentId: "root" });
    history.execute({ type: "CREATE_NODE", nodeId: "z", nodeType: "box", parentId: "root" });
    // "y" ha a sua volta discendenti, per verificare che l'undo li ripristini tutti.
    history.execute({ type: "CREATE_NODE", nodeId: "y-child", nodeType: "text", parentId: "y" });

    expect(validateDocument(history.document)).toEqual([]);
    const sizeBeforeDelete = history.document.nodes.size;
    const childrenBeforeDelete = getNode(history.document, "root")!.childrenIds;
    expect(childrenBeforeDelete).toEqual(["x", "y", "z"]);
    const hashBeforeDelete = hashDocument(history.document);

    history.execute({ type: "DELETE_NODE", nodeId: "y" });

    // dopo il delete: "y" e "y-child" spariti, root ha solo x e z, nessun orfano
    expect(getNode(history.document, "y")).toBeUndefined();
    expect(getNode(history.document, "y-child")).toBeUndefined();
    expect(getNode(history.document, "root")!.childrenIds).toEqual(["x", "z"]);
    expect(history.document.nodes.size).toBe(sizeBeforeDelete - 2); // y + y-child rimossi
    expect(validateDocument(history.document)).toEqual([]);

    history.undo();

    // dopo l'undo: struttura ESATTAMENTE come prima, ordine dei figli incluso
    expect(getNode(history.document, "y")).toBeDefined();
    expect(getNode(history.document, "y-child")).toBeDefined();
    expect(getNode(history.document, "root")!.childrenIds).toEqual(childrenBeforeDelete);
    expect(history.document.nodes.size).toBe(sizeBeforeDelete);
    expect(hashDocument(history.document)).toBe(hashBeforeDelete);
    expect(validateDocument(history.document)).toEqual([]);
  });

  it("undo() è O(1) rispetto a N: non ricostruisce il Document, restituisce lo stesso riferimento già calcolato, a qualunque scala", () => {
    // Test STRUTTURALE, non a soglia temporale (una soglia sui millisecondi
    // si è rivelata fragile in questo ambiente: vedi performance.test.ts).
    // Proprietà osservabile usata come prova: History.undo() (history.ts)
    // fa solo `#past.pop()` + `#future.unshift(#present)` + riassegnazione -
    // non itera mai su document.nodes/document.pages. Se così è, undo() deve
    // restituire ESATTAMENTE lo stesso riferimento d'oggetto salvato prima
    // del comando (identità, non solo contenuto uguale): un'operazione che
    // dovesse attraversare o ricostruire qualcosa in proporzione a N non
    // potrebbe produrre lo stesso riferimento di un oggetto preesistente -
    // ogni comando (CREATE_NODE/UPDATE_PROPS/DELETE_NODE) alloca sempre una
    // `new Map(document.nodes)` nuova, quindi produce sempre un Document con
    // identità diversa (vedi commandBus.test.ts, "does not mutate the input
    // Document"). Verificato a due scale molto diverse per mostrare
    // esplicitamente che la proprietà non dipende da N.
    for (const n of [1, 10_000]) {
      const history = new History(buildFlatDocumentDirectly(n));
      const documentBeforeCommand = history.document;

      history.execute({ type: "CREATE_NODE", nodeId: "x", nodeType: "box", parentId: "root" });
      const documentAfterCommand = history.document;
      expect(documentAfterCommand).not.toBe(documentBeforeCommand); // sanity: il comando alloca davvero un nuovo Document

      const documentAfterUndo = history.undo();
      expect(documentAfterUndo).toBe(documentBeforeCommand); // identità di riferimento, non deep-equal
      expect(history.document).toBe(documentBeforeCommand);
    }
  });
});
