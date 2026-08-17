import { beforeEach, describe, expect, it } from "vitest";
import { applyCommand, createDocument, hashDocument, serializeDocument } from "@vicolobuilder/engine";
import {
  hasSavedDocument,
  loadDocumentFromLocalStorage,
  saveDocumentToLocalStorage,
} from "../../src/persistence/localDocumentStorage.js";

// jsdom (vite.config.ts, test.environment: "jsdom") fornisce un vero
// `window.localStorage` in memoria - nessun mock necessario, ma va svuotato
// tra un test e l'altro: a differenza degli altri moduli testati in questo
// package, questo È l'unico con stato persistente condiviso tra i test.
beforeEach(() => {
  window.localStorage.clear();
});

function sampleDocument() {
  let doc = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
  doc = applyCommand(doc, {
    type: "CREATE_NODE",
    nodeId: "a",
    nodeType: "box",
    parentId: "root",
    props: { x: 10, y: 10, width: 100, height: 50, text: "Ciao" },
  });
  return doc;
}

describe("localDocumentStorage", () => {
  it("hasSavedDocument() è false quando non è stato ancora salvato nulla", () => {
    expect(hasSavedDocument()).toBe(false);
  });

  it("salva e ricarica un Document identico (stesso hash di contenuto)", () => {
    const original = sampleDocument();
    saveDocumentToLocalStorage(original);

    expect(hasSavedDocument()).toBe(true);
    const loaded = loadDocumentFromLocalStorage();

    expect(hashDocument(loaded)).toBe(hashDocument(original));
    expect(serializeDocument(loaded)).toBe(serializeDocument(original));
  });

  it("loadDocumentFromLocalStorage lancia se non c'è nulla di salvato", () => {
    expect(() => loadDocumentFromLocalStorage()).toThrow("Nessun documento salvato");
  });

  it("loadDocumentFromLocalStorage lancia (DocumentParseError) su contenuto non-JSON", () => {
    window.localStorage.setItem("vicolobuilder:document", "{not valid");
    expect(() => loadDocumentFromLocalStorage()).toThrow();
  });

  it("loadDocumentFromLocalStorage lancia (DocumentInvariantError) su un Document strutturalmente invalido", () => {
    const invalid = JSON.stringify({
      schemaVersion: createDocument().schemaVersion,
      rootPageId: "p",
      pages: [{ id: "p", name: "Home", rootNodeId: "root", props: [] }],
      nodes: [
        { id: "root", type: "box", parentId: null, childrenIds: ["a"], props: [] },
        { id: "a", type: "box", parentId: "root", childrenIds: ["root"], props: [] },
      ],
    });
    window.localStorage.setItem("vicolobuilder:document", invalid);
    expect(() => loadDocumentFromLocalStorage()).toThrow(/invariant/i);
  });

  it("un secondo salvataggio sovrascrive il precedente", () => {
    saveDocumentToLocalStorage(sampleDocument());
    const second = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
    saveDocumentToLocalStorage(second);

    const loaded = loadDocumentFromLocalStorage();
    expect(hashDocument(loaded)).toBe(hashDocument(second));
  });
});
