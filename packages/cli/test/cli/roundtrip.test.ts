import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createDocument, exportIR } from "@vicolobuilder/engine";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_PATH = join(__dirname, "..", "..", "dist", "bin", "builder.js");

function runBin(args: string[], cwd: string): string {
  return execFileSync(process.execPath, [BIN_PATH, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString("utf8");
}

// Verifica end-to-end del criterio di successo del vertical slice
// (PROJECT_BRIEF.md: "Export IR è identico byte-per-byte se generato da UI
// o da CLI con lo stesso Document") lungo il percorso reale
// create -> (file su disco) -> export, non solo in-process.
describe("round-trip create -> export (criterio di successo: IR byte-per-byte)", () => {
  it("l'IR ottenuto da `builder export` sul file scritto da `builder create` è identico a exportIR() chiamato direttamente sul Document mai serializzato", () => {
    const dir = mkdtempSync(join(tmpdir(), "builder-roundtrip-"));

    runBin(["create", "demo.json"], dir);
    const exportStdout = runBin(["export", "demo.json"], dir);

    const original = createDocument();
    const expected = exportIR(original, { breakpoint: "desktop", pageId: original.rootPageId, viewportWidth: 1280 });

    expect(exportStdout.trim()).toBe(JSON.stringify(expected));
  });

  it("il file scritto da `create` resta invariato dopo `export`", () => {
    const dir = mkdtempSync(join(tmpdir(), "builder-roundtrip-"));

    runBin(["create", "demo.json"], dir);
    const beforeExport = readFileSync(join(dir, "demo.json"), "utf8");
    runBin(["export", "demo.json"], dir);
    const afterExport = readFileSync(join(dir, "demo.json"), "utf8");

    expect(afterExport).toBe(beforeExport);
  });
});
