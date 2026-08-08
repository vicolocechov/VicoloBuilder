import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyCommand } from "../../src/runtime/commands.js";
import { createDocument } from "../../src/document/document.js";
import { resolveDocument, resolveNode } from "../../src/resolver/resolveNode.js";

// Nota: packages/engine/test/purity.test.ts scansiona già ricorsivamente
// tutto packages/engine/src (incluso src/resolver), quindi il divieto di
// import React/DOM/Electron/fs/networking (matrice #1) è già protetto da
// quel test senza modifiche. Qui verifichiamo la proprietà #3 (Resolver
// puro, RFC-000 §12): nessun effetto osservabile fuori dal valore di
// ritorno, a parità di input.

function baseDocument() {
  let doc = createDocument({ rootNodeId: "root" });
  doc = applyCommand(doc, {
    type: "CREATE_NODE",
    nodeId: "a",
    nodeType: "box",
    parentId: "root",
    props: { variant: "primary", responsive: { desktop: { padding: 30 } } },
  });
  return doc;
}

describe("resolver — purezza (matrice #3, RFC-000 §12)", () => {
  it("resolveDocument non muta il Document in ingresso", () => {
    const doc = baseDocument();
    const snapshotBefore = JSON.stringify([...doc.nodes.values()]);

    resolveDocument(doc, { breakpoint: "desktop" });

    expect(JSON.stringify([...doc.nodes.values()])).toBe(snapshotBefore);
  });

  it("chiamate ripetute con lo stesso input non hanno effetti collaterali osservabili (nessuno stato nascosto tra chiamate)", () => {
    const doc = baseDocument();
    const results = [];
    for (let i = 0; i < 5; i++) {
      results.push(resolveDocument(doc, { breakpoint: "desktop" }).nodes.get("a")!.resolvedProps);
    }
    // Tutte le chiamate devono produrre lo stesso risultato: se ci fosse
    // stato nascosto (es. un contatore o una cache mutabile a livello di
    // modulo) i risultati potrebbero divergere tra una chiamata e l'altra.
    for (const r of results) {
      expect(r).toEqual(results[0]);
    }
  });

  it("resolveNode non muta l'oggetto DocumentNode in ingresso", () => {
    const doc = baseDocument();
    const node = doc.nodes.get("a")!;
    const propsSnapshot = { ...node.props };

    resolveNode(node, { breakpoint: "desktop" });

    expect(node.props).toEqual(propsSnapshot);
  });
});

describe("resolver — nessun import vietato in src/resolver (verifica puntuale, oltre al test generico)", () => {
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

  it("src/resolver non importa React/DOM/Electron/fs/networking", () => {
    const RESOLVER_DIR = join(import.meta.dirname, "..", "..", "src", "resolver");
    const offenders = listSourceFiles(RESOLVER_DIR).filter((file) =>
      FORBIDDEN_IMPORT_PATTERN.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
