import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyCommand } from "../../src/runtime/commands.js";
import { createDocument } from "../../src/document/document.js";
import { resolveDocument } from "../../src/resolver/resolveNode.js";
import { computeLayout } from "../../src/layout/computeLayout.js";

// Matrice #5 (RFC-000 §12: "LayoutEngine puro").

function documentWithNodes() {
  let doc = createDocument({ rootNodeId: "root" });
  doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
  doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "b", nodeType: "text", parentId: "a", props: { height: 20 } });
  return doc;
}

describe("layout — purezza (matrice #5, RFC-000 §12)", () => {
  it("computeLayout non muta il ResolvedModel in ingresso", () => {
    const model = resolveDocument(documentWithNodes(), { breakpoint: "desktop" });
    const snapshotBefore = JSON.stringify([...model.nodes.values()]);

    computeLayout(model, { viewportWidth: 1280 });

    expect(JSON.stringify([...model.nodes.values()])).toBe(snapshotBefore);
  });

  it("chiamate ripetute con lo stesso input non hanno effetti collaterali osservabili", () => {
    const model = resolveDocument(documentWithNodes(), { breakpoint: "desktop" });
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(computeLayout(model, { viewportWidth: 1280 }));
    }
    for (const r of results) {
      expect(r).toEqual(results[0]);
    }
  });
});

describe("layout — nessun import vietato in src/layout (verifica puntuale, oltre al test generico)", () => {
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

  it("src/layout non importa React/DOM/Electron/fs/networking", () => {
    const LAYOUT_DIR = join(import.meta.dirname, "..", "..", "src", "layout");
    const offenders = listSourceFiles(LAYOUT_DIR).filter((file) =>
      FORBIDDEN_IMPORT_PATTERN.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
