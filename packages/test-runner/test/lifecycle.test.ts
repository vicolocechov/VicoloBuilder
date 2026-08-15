import { describe, expect, it } from "vitest";
import { createDocument, History, hashDocument, exportIR } from "@vicolobuilder/engine";

/**
 * Fase 4 (PROJECT_BRIEF.md, "Test Runner — consumer 3"): "Suite Jest/Vitest
 * che crea un documento, lo modifica, fa undo/redo, esporta — senza DOM,
 * React o Electron." Ogni passo di questo scenario usa esclusivamente
 * simboli importati da "@vicolobuilder/engine" (public API, RFC-000 §11) -
 * nessun import relativo verso i sorgenti dell'Engine.
 */
describe("Test Runner — create -> modify -> undo -> redo -> export", () => {
  it("percorre l'intero ciclo di vita usando solo la public API dell'Engine", () => {
    // 1. create
    const initial = createDocument({ rootPageId: "page-home", rootNodeId: "root" });
    const history = new History(initial);
    const hashInitial = hashDocument(history.document);

    // 2. modify
    history.execute({ type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    const hashModified = hashDocument(history.document);
    expect(hashModified).not.toBe(hashInitial);
    expect(history.document.nodes.has("a")).toBe(true);

    // 3. undo
    expect(history.canUndo).toBe(true);
    history.undo();
    expect(hashDocument(history.document)).toBe(hashInitial);

    // 4. redo
    expect(history.canRedo).toBe(true);
    history.redo();
    expect(hashDocument(history.document)).toBe(hashModified);

    // 5. export
    const ir = exportIR(history.document, { breakpoint: "desktop", pageId: "page-home", viewportWidth: 1280 });
    expect(ir.box.nodeId).toBe("root");
    expect(ir.meta).toEqual({ pageId: "page-home", breakpoint: "desktop", pageProps: {} });
  });
});
