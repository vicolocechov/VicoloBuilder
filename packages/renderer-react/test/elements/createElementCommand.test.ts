import { describe, expect, it } from "vitest";
import { applyCommand, createDocument } from "@vicolobuilder/engine";
import {
  buildCreateElementCommand,
  elementIdBase,
  resolveNewElementParent,
} from "../../src/elements/createElementCommand.js";

function baseDoc() {
  return createDocument({ rootPageId: "page-home", rootNodeId: "root" });
}

describe("elementIdBase", () => {
  it("restituisce una base leggibile per ciascun tipo", () => {
    expect(elementIdBase("text")).toBe("testo");
    expect(elementIdBase("container")).toBe("contenitore");
  });
});

describe("buildCreateElementCommand", () => {
  it("costruisce un CREATE_NODE 'text' con i default approvati", () => {
    const command = buildCreateElementCommand("text", "testo-1", "root");
    expect(command).toEqual({
      type: "CREATE_NODE",
      nodeId: "testo-1",
      nodeType: "text",
      parentId: "root",
      props: { x: 20, y: 20, width: 160, height: 40, text: "Testo" },
    });
  });

  it("costruisce un CREATE_NODE 'container' in modalità libero con i default approvati", () => {
    const command = buildCreateElementCommand("container", "contenitore-1", "root");
    expect(command).toEqual({
      type: "CREATE_NODE",
      nodeId: "contenitore-1",
      nodeType: "box",
      parentId: "root",
      props: { x: 20, y: 20, width: 200, height: 120, layoutMode: "libero" },
    });
  });
});

describe("resolveNewElementParent", () => {
  it("nessuna selezione -> radice della pagina attiva", () => {
    const doc = baseDoc();
    expect(resolveNewElementParent(doc, "root", null, "desktop")).toBe("root");
  });

  it("selezione pendente (nodo inesistente) -> radice della pagina attiva", () => {
    const doc = baseDoc();
    expect(resolveNewElementParent(doc, "root", "non-esiste", "desktop")).toBe("root");
  });

  it("contenitore selezionato in modalità libera -> dentro il contenitore", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "canvas",
      nodeType: "box",
      parentId: "root",
      props: { layoutMode: "libero", width: 400, height: 300 },
    });
    expect(resolveNewElementParent(doc, "root", "canvas", "desktop")).toBe("canvas");
  });

  it("contenitore selezionato a pila -> radice della pagina, NON forzato dentro il contenitore a pila", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "stack", nodeType: "box", parentId: "root" });
    expect(resolveNewElementParent(doc, "root", "stack", "desktop")).toBe("root");
  });

  it("un nodo selezionato senza layoutMode 'libero' (qui una foglia) -> radice della pagina attiva", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "card",
      nodeType: "text",
      parentId: "root",
      props: { x: 0, y: 0, width: 100 },
    });
    expect(resolveNewElementParent(doc, "root", "card", "desktop")).toBe("root");
  });

  it("rispetta un override responsive di layoutMode alla fascia attiva (risolto, non solo il prop base)", () => {
    let doc = baseDoc();
    // props base: nessun layoutMode (equivale a "pila"). Override esplicito
    // SOLO sulla fascia desktop (la più larga: non si propaga a mobile
    // nella cascata mobile-first del resolver - vedi DECISIONS.md D-018 -
    // a differenza di un override lasciato su una fascia stretta).
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "canvas",
      nodeType: "box",
      parentId: "root",
      props: { responsive: { desktop: { layoutMode: "libero" } } },
    });
    expect(resolveNewElementParent(doc, "root", "canvas", "mobile")).toBe("root");
    expect(resolveNewElementParent(doc, "root", "canvas", "desktop")).toBe("canvas");
  });
});
