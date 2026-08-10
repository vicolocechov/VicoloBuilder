import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createDocument, applyCommand, serializeDocument, exportIR } from "@vicolobuilder/engine";

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

function deepChainJson(depth: number): string {
  const nodes = [];
  for (let i = 0; i < depth; i++) {
    nodes.push({
      id: `n${i}`,
      type: "box",
      parentId: i === 0 ? null : `n${i - 1}`,
      childrenIds: i === depth - 1 ? [] : [`n${i + 1}`],
      props: [],
    });
  }
  return JSON.stringify({
    schemaVersion: 1,
    rootPageId: "p",
    pages: [{ id: "p", name: "Home", rootNodeId: "n0" }],
    nodes,
  });
}

describe("builder export — binario compilato", () => {
  it("stampa su stdout l'IR atteso e lascia il file di input intatto", () => {
    const dir = mkdtempSync(join(tmpdir(), "builder-export-"));
    const inputJson = sampleDocumentJson();
    writeFileSync(join(dir, "demo.json"), inputJson, "utf8");

    const result = runBin(["export", "demo.json"], dir);

    expect(result.status).toBe(0);
    expect(readFileSync(join(dir, "demo.json"), "utf8")).toBe(inputJson);

    const doc = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
    const docWithChild = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    const expected = exportIR(docWithChild, { breakpoint: "desktop", pageId: "page-home", viewportWidth: 1280 });

    expect(result.stdout.trim()).toBe(JSON.stringify(expected));
  });

  it("è deterministico: due invocazioni sullo stesso file producono lo stesso stdout", () => {
    const dir = mkdtempSync(join(tmpdir(), "builder-export-"));
    writeFileSync(join(dir, "demo.json"), sampleDocumentJson(), "utf8");

    const first = runBin(["export", "demo.json"], dir);
    const second = runBin(["export", "demo.json"], dir);

    expect(first.stdout).toBe(second.stdout);
  });

  it("fallisce in modo pulito se il file non esiste", () => {
    const dir = mkdtempSync(join(tmpdir(), "builder-export-"));
    const result = runBin(["export", "missing.json"], dir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("builder:");
    expect(result.stderr).not.toContain("node:internal");
  });

  it("fallisce in modo pulito su JSON sintatticamente invalido", () => {
    const dir = mkdtempSync(join(tmpdir(), "builder-export-"));
    writeFileSync(join(dir, "demo.json"), "{not valid", "utf8");

    const result = runBin(["export", "demo.json"], dir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Document valido");
  });

  it("fallisce in modo pulito su un Document strutturalmente invalido (ciclo)", () => {
    const dir = mkdtempSync(join(tmpdir(), "builder-export-"));
    const json = JSON.stringify({
      schemaVersion: 1,
      rootPageId: "p",
      pages: [{ id: "p", name: "Home", rootNodeId: "root" }],
      nodes: [
        { id: "root", type: "box", parentId: null, childrenIds: ["a"], props: [] },
        { id: "a", type: "box", parentId: "root", childrenIds: ["root"], props: [] },
      ],
    });
    writeFileSync(join(dir, "demo.json"), json, "utf8");

    const result = runBin(["export", "demo.json"], dir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("invariante");
  });
});

describe("builder export — verifica D-011 sul path reale (DECISIONS.md)", () => {
  it("un JSON esterno con una catena profonda (oltre le soglie misurate in D-011) fallisce in modo pulito, non con uno stack trace Node grezzo", () => {
    const dir = mkdtempSync(join(tmpdir(), "builder-export-"));
    writeFileSync(join(dir, "demo.json"), deepChainJson(6000), "utf8");

    const result = runBin(["export", "demo.json"], dir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("builder:");
    expect(result.stderr).not.toContain("RangeError");
    expect(result.stderr).not.toContain("at visit");
    expect(result.stderr).not.toContain("node:internal");
  });
});
