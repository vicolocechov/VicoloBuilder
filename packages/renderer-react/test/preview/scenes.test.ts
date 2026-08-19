import { describe, expect, it } from "vitest";
import { applyCommand, createDocument } from "@vicolobuilder/engine";
import { nextSceneOrigin, sceneNodeIds } from "../../src/preview/scenes.js";

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

// Bug segnalato dal proprietario del prodotto: una nuova scena non si
// impilava sotto l'ultima esistente (dipendeva dal layoutMode della radice
// pagina, spesso "libero"). `nextSceneOrigin` garantisce l'impilamento
// SEMPRE, indipendentemente dalla radice - riusa `sceneNodeIds` sopra per
// identificazione/ordine, quindi eredita automaticamente le stesse garanzie
// (solo figli diretti della radice, solo type==="scene").
describe("nextSceneOrigin", () => {
  it("nessuna scena esistente -> origine (0,0), stessa X/Y del default di ELEMENT_DEFAULTS.scene", () => {
    const doc = baseDoc();
    expect(nextSceneOrigin(doc, "page-home", "desktop")).toEqual({ x: 0, y: 0 });
  });

  it("una scena esistente (height=400) -> la successiva si impila sotto (y=400)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s1", nodeType: "scene", parentId: "root", props: { height: 400 } });
    expect(nextSceneOrigin(doc, "page-home", "desktop")).toEqual({ x: 0, y: 400 });
  });

  it("due scene esistenti con altezze diverse -> somma cumulativa nell'ordine di childrenIds", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s1", nodeType: "scene", parentId: "root", props: { height: 400 } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s2", nodeType: "scene", parentId: "root", props: { height: 300 } });
    expect(nextSceneOrigin(doc, "page-home", "desktop")).toEqual({ x: 0, y: 700 });
  });

  it("un elemento non-scena tra le scene non influenza il calcolo (ignorato, come sceneNodeIds)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s1", nodeType: "scene", parentId: "root", props: { height: 400 } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "non-scena", nodeType: "box", parentId: "root", props: { height: 9999 } });
    expect(nextSceneOrigin(doc, "page-home", "desktop")).toEqual({ x: 0, y: 400 });
  });

  it("una scena senza height valido usa il fallback difensivo (400), mai NaN", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s1", nodeType: "scene", parentId: "root" }); // nessun height esplicito
    expect(nextSceneOrigin(doc, "page-home", "desktop")).toEqual({ x: 0, y: 400 });
  });

  it("usa l'altezza RISOLTA alla fascia richiesta (override responsive rispettato, non solo il prop base)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, {
      type: "CREATE_NODE",
      nodeId: "s1",
      nodeType: "scene",
      parentId: "root",
      props: { height: 400, responsive: { "mobile-verticale": { height: 812 } } },
    });
    expect(nextSceneOrigin(doc, "page-home", "desktop")).toEqual({ x: 0, y: 400 });
    expect(nextSceneOrigin(doc, "page-home", "mobile-verticale")).toEqual({ x: 0, y: 812 });
  });

  it("pagina inesistente -> origine (0,0) (stesso fallback di sceneNodeIds)", () => {
    const doc = baseDoc();
    expect(nextSceneOrigin(doc, "non-esiste", "desktop")).toEqual({ x: 0, y: 0 });
  });
});
