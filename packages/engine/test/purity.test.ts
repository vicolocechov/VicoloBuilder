import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// This test file itself uses Node's fs/path — that's fine, it's test
// tooling, not runtime code shipped inside packages/engine/src.

const SRC_DIR = join(import.meta.dirname, "..", "src");

const FORBIDDEN_IMPORT_PATTERN =
  /from\s+["'](react|react-dom|electron|node:fs|fs|node:path|path|node:http|http|node:https|https|node:net|net|node:child_process|child_process|node:crypto)["']|require\(\s*["'](react|react-dom|electron|fs|http|https|net|child_process)["']\s*\)/;

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...listSourceFiles(fullPath));
    } else if (entry.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("engine purity (RFC-000 §2 — Core/Engine indipendente da UI)", () => {
  it("packages/engine/src never imports React, DOM-only, Electron, filesystem, or networking APIs", () => {
    const offenders: string[] = [];

    for (const file of listSourceFiles(SRC_DIR)) {
      const contents = readFileSync(file, "utf8");
      if (FORBIDDEN_IMPORT_PATTERN.test(contents)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("packages/engine/src never references browser-only or Node-only globals", () => {
    // NOTE: a bare `document.` check would false-positive on this codebase's
    // own `Document` domain type (e.g. `document.nodes`), so these target
    // concrete DOM/BOM/Node APIs instead of the ambiguous `document` name.
    const forbiddenGlobals = [
      /\bwindow\./,
      /\bdocument\.(getElementById|createElement|querySelector|addEventListener|body|currentScript)\b/,
      /\blocalStorage\b/,
      /\bsessionStorage\b/,
      /\bXMLHttpRequest\b/,
      /\bprocess\.env\b/,
      /\b__dirname\b/,
      /\brequire\(/,
    ];

    const offenders: { file: string; pattern: string }[] = [];
    for (const file of listSourceFiles(SRC_DIR)) {
      const contents = readFileSync(file, "utf8");
      for (const pattern of forbiddenGlobals) {
        if (pattern.test(contents)) {
          offenders.push({ file, pattern: pattern.source });
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
