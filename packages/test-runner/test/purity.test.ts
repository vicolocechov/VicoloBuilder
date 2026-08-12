import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guardrail aggiuntivo (scansione testuale), non la prova principale che il
// Test Runner consumi solo la public API - quella è strutturale/a tempo di
// compilazione (dipendenza npm su @vicolobuilder/engine, risolta tramite il
// campo "exports" del suo package.json con moduleResolution "Bundler").
// Stesso pattern già usato in packages/engine/test/purity.test.ts.

const TEST_DIR = join(import.meta.dirname);

const FORBIDDEN_IMPORT_PATTERN =
  /from\s+["'](react|react-dom|electron)["']|require\(\s*["'](react|react-dom|electron)["']\s*\)/;

const INTERNAL_ENGINE_IMPORT_PATTERN = /from\s+["'][^"']*packages\/engine\/src/;

function listTestFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...listTestFiles(fullPath));
    } else if (entry.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("test-runner — guardrail import (RFC-000 §2, senza DOM/React/Electron)", () => {
  it("nessun file di test importa React/React-DOM/Electron", () => {
    const offenders = listTestFiles(TEST_DIR).filter((file) => FORBIDDEN_IMPORT_PATTERN.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("nessun file di test importa direttamente i sorgenti interni di packages/engine/src", () => {
    const offenders = listTestFiles(TEST_DIR).filter((file) =>
      INTERNAL_ENGINE_IMPORT_PATTERN.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
