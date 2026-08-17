import { describe, expect, it } from "vitest";
import { createDocument, applyCommand, serializeDocument, DocumentInvariantError, CURRENT_SCHEMA_VERSION } from "@vicolobuilder/engine";
import { DocumentParseError } from "@vicolobuilder/engine";
import { exportSite } from "@vicolobuilder/exporter";
import { runPublish } from "../../src/core/publishCommand.js";

function sampleJson(): string {
  let doc = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
  doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
  return serializeDocument(doc);
}

describe("runPublish — core puro di `builder publish`", () => {
  it("produce lo stesso HTML di exportSite() chiamato direttamente sul Document ricostruito (nessuna logica duplicata)", () => {
    const json = sampleJson();
    const output = runPublish(json);

    const doc = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
    const docWithChild = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    const expected = exportSite(docWithChild, "page-home");

    expect(output).toBe(expected);
  });

  it("è deterministico: due chiamate sullo stesso input producono la stessa stringa", () => {
    const json = sampleJson();
    expect(runPublish(json)).toBe(runPublish(json));
  });

  it("lancia DocumentParseError su JSON sintatticamente invalido", () => {
    expect(() => runPublish("not json")).toThrow(DocumentParseError);
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
    expect(() => runPublish(json)).toThrow(DocumentInvariantError);
  });

  it("produce un file HTML completo che inizia con <!doctype html>", () => {
    expect(runPublish(sampleJson()).startsWith("<!doctype html>")).toBe(true);
  });
});
