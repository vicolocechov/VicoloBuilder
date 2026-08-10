import { describe, expect, it } from "vitest";
import { createDocument } from "../src/document/document.js";
import { applyCommand } from "../src/runtime/commands.js";
import { serializeDocument, hashDocument } from "../src/document/hash.js";
import { deserializeDocument, DocumentParseError } from "../src/document/deserialize.js";
import { validateDocument, assertValidDocument, DocumentInvariantError } from "../src/document/invariants.js";
import { CURRENT_SCHEMA_VERSION } from "../src/document/types.js";

function buildSampleDocument() {
  let doc = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
  doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root", props: { variant: "primary" } });
  doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "a", props: { content: "hi" } });
  return doc;
}

describe("deserializeDocument — round-trip con serializeDocument", () => {
  it("ricostruisce un Document con lo stesso hash dell'originale", () => {
    const original = buildSampleDocument();
    const restored = deserializeDocument(serializeDocument(original));
    expect(hashDocument(restored)).toBe(hashDocument(original));
  });

  it("il Document ricostruito riserializza esattamente alla stessa stringa", () => {
    const original = buildSampleDocument();
    const json = serializeDocument(original);
    const restored = deserializeDocument(json);
    expect(serializeDocument(restored)).toBe(json);
  });

  it("un Document appena creato (nessun figlio) sopravvive al round-trip", () => {
    const original = createDocument();
    const restored = deserializeDocument(serializeDocument(original));
    expect(hashDocument(restored)).toBe(hashDocument(original));
  });

  it("il Document ricostruito passa validateDocument senza violazioni", () => {
    const restored = deserializeDocument(serializeDocument(buildSampleDocument()));
    expect(validateDocument(restored)).toEqual([]);
  });
});

describe("deserializeDocument — JSON sintatticamente invalido", () => {
  it("lancia DocumentParseError su una stringa non-JSON", () => {
    expect(() => deserializeDocument("{not valid json")).toThrow(DocumentParseError);
  });

  it("lancia DocumentParseError su JSON valido ma non un oggetto (es. un array)", () => {
    expect(() => deserializeDocument("[1,2,3]")).toThrow(DocumentParseError);
  });
});

describe("deserializeDocument — forma strutturale insufficiente", () => {
  it('lancia DocumentParseError se manca "nodes"', () => {
    const json = JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, rootPageId: "p", pages: [] });
    expect(() => deserializeDocument(json)).toThrow(DocumentParseError);
  });

  it('lancia DocumentParseError se "nodes" non è un array', () => {
    const json = JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION, rootPageId: "p", pages: [], nodes: {} });
    expect(() => deserializeDocument(json)).toThrow(DocumentParseError);
  });

  it("lancia DocumentParseError se un nodo manca del campo \"id\"", () => {
    const json = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      rootPageId: "p",
      pages: [{ id: "p", name: "Home", rootNodeId: "root" }],
      nodes: [{ type: "box", parentId: null, childrenIds: [], props: [] }],
    });
    expect(() => deserializeDocument(json)).toThrow(DocumentParseError);
  });

  it("lancia DocumentParseError se una voce di \"props\" non è una coppia [chiave, valore]", () => {
    const json = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      rootPageId: "p",
      pages: [{ id: "p", name: "Home", rootNodeId: "root" }],
      nodes: [{ id: "root", type: "box", parentId: null, childrenIds: [], props: ["not-a-pair"] }],
    });
    expect(() => deserializeDocument(json)).toThrow(DocumentParseError);
  });
});

describe("deserializeDocument — schemaVersion", () => {
  it("lancia DocumentParseError su uno schemaVersion diverso da quello corrente", () => {
    const json = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      rootPageId: "p",
      pages: [{ id: "p", name: "Home", rootNodeId: "root" }],
      nodes: [{ id: "root", type: "box", parentId: null, childrenIds: [], props: [] }],
    });
    expect(() => deserializeDocument(json)).toThrow(DocumentParseError);
  });
});

describe("deserializeDocument — non valida gli invarianti del grafo (responsabilità separata)", () => {
  it("un Document strutturalmente valido ma con un ciclo viene deserializzato senza lanciare, e viene poi rifiutato da assertValidDocument", () => {
    const json = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      rootPageId: "p",
      pages: [{ id: "p", name: "Home", rootNodeId: "root" }],
      nodes: [
        { id: "root", type: "box", parentId: null, childrenIds: ["a"], props: [] },
        { id: "a", type: "box", parentId: "root", childrenIds: ["root"], props: [] },
      ],
    });

    const document = deserializeDocument(json);
    expect(() => assertValidDocument(document)).toThrow(DocumentInvariantError);
  });
});
