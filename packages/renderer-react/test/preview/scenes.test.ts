import { describe, expect, it } from "vitest";
import { applyCommand, createDocument } from "@vicolobuilder/engine";
import { sceneNodeIds } from "../../src/preview/scenes.js";

function baseDoc() {
  return createDocument({ rootPageId: "page-home", rootNodeId: "root" });
}

describe("sceneNodeIds", () => {
  it("pagina inesistente -> lista vuota", () => {
    const doc = baseDoc();
    expect(sceneNodeIds(doc, "non-esiste")).toEqual([]);
  });

  it("nessun figlio con type==='scene' -> lista vuota (fallback Punto 1 dell'analisi Fase 7)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "a", nodeType: "box", parentId: "root" });
    expect(sceneNodeIds(doc, "page-home")).toEqual([]);
  });

  it("filtra solo i figli diretti con type==='scene', nell'ordine di childrenIds", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s1", nodeType: "scene", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "non-scena", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s2", nodeType: "scene", parentId: "root" });
    expect(sceneNodeIds(doc, "page-home")).toEqual(["s1", "s2"]);
  });

  it("ignora un nodo type==='scene' che non è figlio diretto della radice pagina (nipote)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "contenitore", nodeType: "box", parentId: "root" });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "scena-annidata", nodeType: "scene", parentId: "contenitore" });
    expect(sceneNodeIds(doc, "page-home")).toEqual([]);
  });
});
