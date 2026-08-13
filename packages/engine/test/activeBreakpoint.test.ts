import { describe, expect, it } from "vitest";
import { createDocument } from "../src/document/document.js";
import { History } from "../src/runtime/history.js";

// Fase 5, Blocco D (Decisione D4): History possiede la vista attiva per
// l'editing responsive, con le stesse garanzie già verificate per la
// selezione (Blocco C): separata da undo/redo, nessun comando.

function baseDocument() {
  return createDocument({ rootPageId: "page-home", rootNodeId: "root" });
}

describe("History — activeBreakpoint", () => {
  it('parte su "desktop" (convenzione Desktop-first)', () => {
    const history = new History(baseDocument());
    expect(history.activeBreakpoint).toBe("desktop");
  });

  it("setActiveBreakpoint() cambia la vista attiva a un breakpoint noto", () => {
    const history = new History(baseDocument());
    history.setActiveBreakpoint("tablet");
    expect(history.activeBreakpoint).toBe("tablet");

    history.setActiveBreakpoint("mobile");
    expect(history.activeBreakpoint).toBe("mobile");
  });

  it("lancia su un nome di breakpoint sconosciuto, e non cambia la vista attiva", () => {
    const history = new History(baseDocument());
    expect(() => history.setActiveBreakpoint("ultra-wide")).toThrow();
    expect(history.activeBreakpoint).toBe("desktop");
  });

  it("setActiveBreakpoint() non crea voci di undo/redo e non modifica il Document", () => {
    const history = new History(baseDocument());
    const documentBefore = history.document;

    history.setActiveBreakpoint("tablet");

    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.document).toBe(documentBefore);
  });

  it("undo/redo non toccano activeBreakpoint", () => {
    const history = new History(baseDocument());
    history.execute({ type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    history.setActiveBreakpoint("mobile");

    history.undo();
    expect(history.activeBreakpoint).toBe("mobile");

    history.redo();
    expect(history.activeBreakpoint).toBe("mobile");
  });

  it("execute() non azzera né altera activeBreakpoint", () => {
    const history = new History(baseDocument());
    history.setActiveBreakpoint("tablet");
    history.execute({ type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    expect(history.activeBreakpoint).toBe("tablet");
  });
});
