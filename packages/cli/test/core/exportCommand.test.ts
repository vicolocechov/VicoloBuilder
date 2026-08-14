import { describe, expect, it } from "vitest";
import { createDocument, applyCommand, serializeDocument, exportIR, DocumentInvariantError, CURRENT_SCHEMA_VERSION } from "@vicolobuilder/engine";
import { DocumentParseError } from "@vicolobuilder/engine";
import { runExport } from "../../src/core/exportCommand.js";

function sampleJson(): string {
  let doc = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
  doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
  return serializeDocument(doc);
}

describe("runExport — core puro di `builder export`", () => {
  it("produce lo stesso IR di exportIR() chiamato direttamente sul Document ricostruito (nessuna logica duplicata)", () => {
    const json = sampleJson();
    const output = runExport(json);

    const doc = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
    const docWithChild = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    const expected = exportIR(docWithChild, { breakpoint: "desktop", pageId: "page-home", viewportWidth: 1280 });

    expect(output).toBe(JSON.stringify(expected));
  });

  it("è deterministico: due chiamate sullo stesso input producono la stessa stringa", () => {
    const json = sampleJson();
    expect(runExport(json)).toBe(runExport(json));
  });

  it("lancia DocumentParseError su JSON sintatticamente invalido", () => {
    expect(() => runExport("not json")).toThrow(DocumentParseError);
  });

  it("lancia DocumentInvariantError su un Document strutturalmente invalido (es. un ciclo)", () => {
    const json = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      rootPageId: "p",
      pages: [{ id: "p", name: "Home", rootNodeId: "root" }],
      nodes: [
        { id: "root", type: "box", parentId: null, childrenIds: ["a"], props: [] },
        { id: "a", type: "box", parentId: "root", childrenIds: ["root"], props: [] },
      ],
    });
    expect(() => runExport(json)).toThrow(DocumentInvariantError);
  });
});
