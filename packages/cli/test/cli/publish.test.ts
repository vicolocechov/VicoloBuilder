import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createDocument, applyCommand, serializeDocument, CURRENT_SCHEMA_VERSION } from "@vicolobuilder/engine";
import { exportSite } from "@vicolobuilder/exporter";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_PATH = join(__dirname, "..", "..", "dist", "bin", "builder.js");

function runBin(args: string[], cwd: string): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [BIN_PATH, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stdout: stdout.toString("utf8"), stderr: "" };
  } catch (error) {
    const err = error as { status: number | null; stdout: Buffer; stderr: Buffer };
    return { status: err.status ?? 1, stdout: err.stdout?.toString("utf8") ?? "", stderr: err.stderr.toString("utf8") };
  }
}

function sampleDocumentJson(): string {
  let doc = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
  doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
  return serializeDocument(doc);
}

describe("builder publish — binario compilato", () => {
  it("stampa su stdout l'HTML atteso e lascia il file di input intatto", () => {
    const dir = mkdtempSync(join(tmpdir(), "builder-publish-"));
    const inputJson = sampleDocumentJson();
    writeFileSync(join(dir, "demo.json"), inputJson, "utf8");

    const result = runBin(["publish", "demo.json"], dir);

    expect(result.status).toBe(0);
    expect(readFileSync(join(dir, "demo.json"), "utf8")).toBe(inputJson);

    const doc = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
    const docWithChild = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    const expected = exportSite(docWithChild, "page-home");

    expect(result.stdout.trim()).toBe(expected);
  });

  it("è deterministico: due invocazioni sullo stesso file producono lo stesso stdout", () => {
    const dir = mkdtempSync(join(tmpdir(), "builder-publish-"));
    writeFileSync(join(dir, "demo.json"), sampleDocumentJson(), "utf8");

    const first = runBin(["publish", "demo.json"], dir);
    const second = runBin(["publish", "demo.json"], dir);

    expect(first.stdout).toBe(second.stdout);
  });

  it("fallisce in modo pulito se il file non esiste", () => {
    const dir = mkdtempSync(join(tmpdir(), "builder-publish-"));
    const result = runBin(["publish", "missing.json"], dir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("builder:");
    expect(result.stderr).not.toContain("node:internal");
  });

  it("fallisce in modo pulito su JSON sintatticamente invalido", () => {
    const dir = mkdtempSync(join(tmpdir(), "builder-publish-"));
    writeFileSync(join(dir, "demo.json"), "{not valid", "utf8");

    const result = runBin(["publish", "demo.json"], dir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Document valido");
  });

  it("fallisce in modo pulito su un Document strutturalmente invalido (ciclo)", () => {
    const dir = mkdtempSync(join(tmpdir(), "builder-publish-"));
    const json = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      rootPageId: "p",
      pages: [{ id: "p", name: "Home", rootNodeId: "root" }],
      nodes: [
        { id: "root", type: "box", parentId: null, childrenIds: ["a"], props: [] },
        { id: "a", type: "box", parentId: "root", childrenIds: ["root"], props: [] },
      ],
    });
    writeFileSync(join(dir, "demo.json"), json, "utf8");

    const result = runBin(["publish", "demo.json"], dir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("invariante");
  });
});

describe("round-trip create -> publish (stesso criterio del vertical slice, esteso all'HTML)", () => {
  it("l'HTML ottenuto da `builder publish` sul file scritto da `builder create` è identico a exportSite() chiamato direttamente sul Document mai serializzato", () => {
    const dir = mkdtempSync(join(tmpdir(), "builder-roundtrip-publish-"));

    runBin(["create", "demo.json"], dir);
    const publishStdout = runBin(["publish", "demo.json"], dir);

    const original = createDocument();
    const expected = exportSite(original, original.rootPageId);

    expect(publishStdout.stdout.trim()).toBe(expected);
  });
});
