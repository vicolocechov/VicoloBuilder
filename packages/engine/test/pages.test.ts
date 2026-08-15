import { describe, expect, it } from "vitest";
import { createDocument } from "../src/document/document.js";
import { applyCommand, CommandError } from "../src/runtime/commands.js";
import { validateDocument } from "../src/document/invariants.js";

// Fase 5, Blocco A: CREATE_PAGE / DELETE_PAGE / REORDER_PAGES.

function baseDocument() {
  return createDocument({ rootPageId: "page-home", rootNodeId: "root" });
}

describe("CREATE_PAGE", () => {
  it("crea una nuova pagina con un nodo radice vuoto e la aggiunge in coda a pageOrder", () => {
    const doc = applyCommand(baseDocument(), {
      type: "CREATE_PAGE",
      pageId: "page-about",
      name: "Chi siamo",
      rootNodeId: "root-about",
    });

    const page = doc.pages.get("page-about");
    expect(page).toEqual({ id: "page-about", name: "Chi siamo", rootNodeId: "root-about", props: {} });
    expect(doc.nodes.get("root-about")).toEqual({
      id: "root-about",
      type: "page-root",
      parentId: null,
      childrenIds: [],
      props: {},
    });
    expect(doc.pageOrder).toEqual(["page-home", "page-about"]);
    expect(validateDocument(doc)).toEqual([]);
  });

  it("rispetta rootNodeType se fornito", () => {
    const doc = applyCommand(baseDocument(), {
      type: "CREATE_PAGE",
      pageId: "page-about",
      name: "Chi siamo",
      rootNodeId: "root-about",
      rootNodeType: "scene",
    });
    expect(doc.nodes.get("root-about")!.type).toBe("scene");
  });

  it("rifiuta un pageId già esistente", () => {
    expect(() =>
      applyCommand(baseDocument(), {
        type: "CREATE_PAGE",
        pageId: "page-home",
        name: "Duplicata",
        rootNodeId: "root-2",
      }),
    ).toThrow(CommandError);
  });

  it("rifiuta un rootNodeId già esistente", () => {
    expect(() =>
      applyCommand(baseDocument(), { type: "CREATE_PAGE", pageId: "page-about", name: "Chi siamo", rootNodeId: "root" }),
    ).toThrow(CommandError);
  });
});

describe("DELETE_PAGE", () => {
  function twoPageDocument() {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_PAGE", pageId: "page-about", name: "Chi siamo", rootNodeId: "root-about" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "about-child", nodeType: "text", parentId: "root-about" });
    return doc;
  }

  it("elimina la pagina e l'intero sottoalbero dei suoi nodi (cascata)", () => {
    const doc = applyCommand(twoPageDocument(), { type: "DELETE_PAGE", pageId: "page-about" });

    expect(doc.pages.has("page-about")).toBe(false);
    expect(doc.nodes.has("root-about")).toBe(false);
    expect(doc.nodes.has("about-child")).toBe(false);
    expect(doc.pageOrder).toEqual(["page-home"]);
    expect(validateDocument(doc)).toEqual([]);
  });

  it("rifiuta l'eliminazione dell'unica pagina rimasta", () => {
    expect(() => applyCommand(baseDocument(), { type: "DELETE_PAGE", pageId: "page-home" })).toThrow(CommandError);
  });

  it("rifiuta l'eliminazione della pagina che è Document.rootPageId, anche se non è l'unica", () => {
    const doc = twoPageDocument();
    expect(doc.rootPageId).toBe("page-home");
    expect(() => applyCommand(doc, { type: "DELETE_PAGE", pageId: "page-home" })).toThrow(CommandError);
  });

  it("rifiuta un pageId inesistente", () => {
    expect(() => applyCommand(twoPageDocument(), { type: "DELETE_PAGE", pageId: "does-not-exist" })).toThrow(CommandError);
  });
});

describe("REORDER_PAGES", () => {
  function threePageDocument() {
    let doc = baseDocument();
    doc = applyCommand(doc, { type: "CREATE_PAGE", pageId: "page-about", name: "Chi siamo", rootNodeId: "root-about" });
    doc = applyCommand(doc, { type: "CREATE_PAGE", pageId: "page-contact", name: "Contatti", rootNodeId: "root-contact" });
    return doc;
  }

  it("accetta una permutazione valida e la applica esattamente", () => {
    const doc = applyCommand(threePageDocument(), {
      type: "REORDER_PAGES",
      pageOrder: ["page-contact", "page-home", "page-about"],
    });
    expect(doc.pageOrder).toEqual(["page-contact", "page-home", "page-about"]);
    expect(validateDocument(doc)).toEqual([]);
  });

  it("rifiuta un pageOrder con un id mancante", () => {
    expect(() =>
      applyCommand(threePageDocument(), { type: "REORDER_PAGES", pageOrder: ["page-home", "page-about"] }),
    ).toThrow(CommandError);
  });

  it("rifiuta un pageOrder con un id sconosciuto", () => {
    expect(() =>
      applyCommand(threePageDocument(), {
        type: "REORDER_PAGES",
        pageOrder: ["page-home", "page-about", "page-contact", "page-ghost"],
      }),
    ).toThrow(CommandError);
  });

  it("rifiuta un pageOrder con un id duplicato", () => {
    expect(() =>
      applyCommand(threePageDocument(), {
        type: "REORDER_PAGES",
        pageOrder: ["page-home", "page-home", "page-about"],
      }),
    ).toThrow(CommandError);
  });
});
