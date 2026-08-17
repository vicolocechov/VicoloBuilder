import { describe, expect, it } from "vitest";
import {
  createDocument,
  applyCommand,
  serializeDocument,
  deserializeDocument,
  DocumentParseError,
  exportIR,
  getBreakpoint,
  listBreakpointNames,
} from "../src/index.js";

// Verifica che i simboli di questo blocco (exportIR, deserializeDocument,
// DocumentParseError) siano davvero raggiungibili dal barrel pubblico
// (RFC-000 §11), non solo dai percorsi interni usati nel resto della suite.
// Un consumer esterno reale (CLI) può importare solo da qui.
describe("barrel pubblico (src/index.ts) — exportIR + deserializeDocument", () => {
  it("una pipeline end-to-end (create -> command -> serialize -> deserialize -> exportIR) funziona usando solo il barrel", () => {
    let doc = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });

    const restored = deserializeDocument(serializeDocument(doc));
    const ir = exportIR(restored, { breakpoint: "desktop", pageId: "page-home", viewportWidth: 1280 });

    expect(ir.box.nodeId).toBe("root");
    expect(ir.meta).toEqual({ pageId: "page-home", breakpoint: "desktop", pageProps: {}, documentProps: {} });
  });

  it("DocumentParseError è la classe effettivamente lanciata dal barrel su JSON non valido", () => {
    expect(() => deserializeDocument("not json")).toThrow(DocumentParseError);
  });
});

// D-042: getBreakpoint aggiunta al barrel pubblico (reversione mirata di
// D-010) - un consumer esterno reale (Exporter) ha bisogno delle soglie
// vere di ciascuna fascia, non solo del nome.
describe("barrel pubblico (src/index.ts) — getBreakpoint (D-042)", () => {
  it("restituisce lo stesso predicato esatto per ognuna delle fasce elencate da listBreakpointNames", () => {
    for (const name of listBreakpointNames()) {
      expect(getBreakpoint(name).name).toBe(name);
    }
  });

  it("lancia su un nome sconosciuto, invece di restituire un default silenzioso", () => {
    expect(() => getBreakpoint("does-not-exist")).toThrow();
  });
});
