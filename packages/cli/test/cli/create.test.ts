import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createDocument, serializeDocument } from "@vicolobuilder/engine";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BIN_PATH = join(__dirname, "..", "..", "dist", "bin", "builder.js");

function runBin(args: string[], cwd: string): { status: number; stderr: string } {
  try {
    execFileSync(process.execPath, [BIN_PATH, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stderr: "" };
  } catch (error) {
    const err = error as { status: number | null; stderr: Buffer };
    return { status: err.status ?? 1, stderr: err.stderr.toString("utf8") };
  }
}

describe("builder create — binario compilato (riga #10 matrice Fase 3: invocabile come comando reale, non solo come funzione TS)", () => {
  it("scrive un file byte-identico a runCreate()/serializeDocument(createDocument())", () => {
    const dir = mkdtempSync(join(tmpdir(), "builder-create-"));
    const result = runBin(["create", "demo.json"], dir);

    expect(result.status).toBe(0);
    const written = readFileSync(join(dir, "demo.json"), "utf8");
    expect(written).toBe(serializeDocument(createDocument()));
  });

  it("sovrascrive silenziosamente un file già esistente, senza flag/conferma (decisione esplicita, non comportamento inventato)", () => {
    const dir = mkdtempSync(join(tmpdir(), "builder-create-"));
    const first = runBin(["create", "demo.json"], dir);
    const second = runBin(["create", "demo.json"], dir);

    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(readFileSync(join(dir, "demo.json"), "utf8")).toBe(serializeDocument(createDocument()));
  });

  it("fallisce in modo pulito (stderr + exit code, non uno stack trace Node) su una directory di output inesistente (riga #8 matrice Fase 3)", () => {
    const dir = mkdtempSync(join(tmpdir(), "builder-create-"));
    const result = runBin(["create", "missing-subdir/demo.json"], dir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("builder:");
    expect(result.stderr).not.toContain("at Object");
    expect(result.stderr).not.toContain("node:internal");
  });

  it("fallisce in modo pulito quando un componente del path di output è un file, non una directory (errore filesystem strutturale, non aggirabile da permessi)", () => {
    const dir = mkdtempSync(join(tmpdir(), "builder-create-"));
    writeFileSync(join(dir, "not-a-dir"), "");

    const result = runBin(["create", "not-a-dir/demo.json"], dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("builder:");
  });

  it("fallisce in modo pulito su un comando sconosciuto", () => {
    const dir = mkdtempSync(join(tmpdir(), "builder-create-"));
    const result = runBin(["delete", "demo.json"], dir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("comando sconosciuto");
  });

  it("fallisce in modo pulito quando manca il path del file", () => {
    const dir = mkdtempSync(join(tmpdir(), "builder-create-"));
    const result = runBin(["create"], dir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("percorso file mancante");
  });
});
