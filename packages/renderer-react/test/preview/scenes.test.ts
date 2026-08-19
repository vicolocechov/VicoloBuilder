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
// SEMPRE, indipendentemente dalla radice.
//
// Bug 2 (secondo giro, diagnosi + fix): la prima versione sommava SOLO le
// altezze delle altre SCENE, ignorando qualunque elemento non-scena che le
// precedesse - una scena poteva sovrapporsi a un testo/contenitore già
// presente alla radice. Corretto (Opzione B): la somma include TUTTI i
// figli diretti della radice, scena o no, nell'ordine di `childrenIds`.
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

  // Bug 2: caso esatto della segnalazione - un elemento non-scena creato
  // PRIMA di qualunque scena (es. un testo alla radice di una pagina non
  // ancora basata su scene) deve contare nella somma, non essere ignorato.
  it("Bug 2 — un elemento non-scena PRIMA della prima scena viene incluso nella somma (non più ignorato)", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "non-scena", nodeType: "box", parentId: "root", props: { height: 9999 } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s1", nodeType: "scene", parentId: "root", props: { height: 400 } });
    expect(nextSceneOrigin(doc, "page-home", "desktop")).toEqual({ x: 0, y: 9999 + 400 });
  });

  // Bug 2, richiesto esplicitamente: un elemento non-scena INTERCALATO tra
  // due scene esistenti (non solo prima della prima) deve anch'esso essere
  // incluso - nessun caso speciale per "prima" vs "in mezzo", la somma
  // scorre semplicemente l'intero `childrenIds` nell'ordine reale.
  it("Bug 2 — un elemento non-scena INTERCALATO tra due scene viene incluso nella somma", () => {
    let doc = baseDoc();
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s1", nodeType: "scene", parentId: "root", props: { height: 400 } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "intercalato", nodeType: "text", parentId: "root", props: { height: 150 } });
    doc = applyCommand(doc, { type: "CREATE_NODE", nodeId: "s2", nodeType: "scene", parentId: "root", props: { height: 300 } });
    // Una terza scena si impilerebbe dopo TUTTO: 400 (s1) + 150 (intercalato) + 300 (s2) = 850.
    expect(nextSceneOrigin(doc, "page-home", "desktop")).toEqual({ x: 0, y: 850 });
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

  it("pagina inesistente -> origine (0,0)", () => {
    const doc = baseDoc();
    expect(nextSceneOrigin(doc, "non-esiste", "desktop")).toEqual({ x: 0, y: 0 });
  });
});
